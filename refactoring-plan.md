# atom-effect Set/Map 제거 리팩토링 계획

## 현황 분석

### Set/Map 사용처 (총 4곳)

| 위치 | 타입 | 용도 | 영향도 |
| ------ | ------ | ------ | -------- |
| `Computed._subscriptions` | `Map<number, () => void>` | dep.id → unsubscribe 매핑 | 🔴 높음 |
| `Effect._subscriptions` | `Map<number, () => void>` | dep.id → unsubscribe 매핑 | 🔴 높음 |
| `Effect._modifiedDeps` | `Set<unknown>` | 수정된 deps 추적 (디버깅) | 🟢 낮음 |
| `debug.checkCircular` | `Set<unknown>` | 순환 참조 체크 (dev only) | 🟢 낮음 |

---

## Phase 1: `_subscriptions` Map 제거 (핵심)

### 현재 구조

```ts
// Computed, Effect 둘 다 동일한 패턴
private _dependencies: Dependency[];
private _subscriptions: Map<number, () => void>;

// 구독
_subscriptions.set(dep.id, unsubscribe);

// 해제
const unsub = _subscriptions.get(dep.id);
unsub?.();
_subscriptions.delete(dep.id);

// 존재 여부
_subscriptions.has(dep.id);
```

### 변경 후 구조

**핵심 아이디어**: dependencies 배열과 1:1 매칭되는 unsubscribes 배열 사용

```ts
private _dependencies: Dependency[];
private _unsubscribes: (() => void)[];  // 동일 인덱스로 매핑

// 구독 (인덱스 기반)
_dependencies.push(dep);
_unsubscribes.push(unsubscribe);

// 해제 (epoch 기반으로 이미 하고 있음)
for (let i = 0; i < _dependencies.length; i++) {
  if (_dependencies[i]._lastSeenEpoch !== epoch) {
    _unsubscribes[i]?.();
    // swap-and-pop으로 제거
  }
}

// 존재 여부: epoch 체크로 대체 (이미 하고 있음!)
if (dep._lastSeenEpoch === epoch) return; // 이미 구독됨
```

### 변경 파일

#### `core/computed/index.ts`

```ts
// Before
private readonly _subscriptions: Map<number, () => void>;
this._subscriptions = new Map();

// After
private _unsubscribes: (() => void)[];
this._unsubscribes = [];
```

**_syncDependencies 수정 (O(N) 최적화 적용):**

* `unsubArrayPool` 도입 (src/pool.ts)
* `indexOf` (O(N²)) 제거 → `_tempUnsub` 필드 활용 (O(N))

```ts
// Optimization: O(N) Sync Strategy using _tempUnsub field
private _syncDependencies(prevDeps: Dependency[], nextDeps: Dependency[], prevUnsubs: (() => void)[], epoch: number): void {
  // 1. 기존 구독 정보를 Dependency 객체에 임시 저장 (Mapping)
  // this loop is O(prevDeps.length)
  for (let i = 0; i < prevDeps.length; i++) {
    const dep = prevDeps[i];
    if (dep) dep._tempUnsub = prevUnsubs[i];
  }

  // 2. 새 구독 배열 구성 및 정리 (Sync)
  // this loop is O(nextDeps.length)
  const nextUnsubs = unsubArrayPool.acquire(); // Pool에서 가져오기
  
  for (let i = 0; i < nextDeps.length; i++) {
    const dep = nextDeps[i];
    // 이전에 구독했던 의존성이면 재사용
    if (dep._tempUnsub) {
      nextUnsubs[i] = dep._tempUnsub;
      dep._tempUnsub = undefined; // 사용 후 즉시 초기화 (중요)
    } else {
      // 새 구독 (순환 참조 체크 등 포함)
      debug.checkCircular(dep, this);
      nextUnsubs[i] = dep.subscribe(() => this._markDirty());
    }
  }

  // 3. 남은(사용되지 않은) 구독 해제 (Cleanup)
  // this loop is O(prevDeps.length)
  for (let i = 0; i < prevDeps.length; i++) {
    const dep = prevDeps[i];
    if (dep && dep._tempUnsub) {
      // 여전히 _tempUnsub가 남아있다면 이번 epoch에서 제외된 것 -> 해제
      dep._tempUnsub();
      dep._tempUnsub = undefined; // 정리
    }
  }

  // 4. 이전 배열 반납
  unsubArrayPool.release(prevUnsubs);
  this._unsubscribes = nextUnsubs;
}
```

#### `core/effect/effect.ts`

동일한 패턴 적용.

---

## Phase 2: `_modifiedDeps` Set 제거 (선택적)

**용도**: `trackModifications` 옵션 활성화 시 디버깅용

### 현재

```ts
private readonly _modifiedDeps: Set<unknown>;
this._modifiedDeps.add(dep);
this._modifiedDeps.has(dep);
this._modifiedDeps.clear();
```

### 변경 후

**방법 1: 배열 + indexOf** (간단)

```ts
private _modifiedDeps: unknown[] = [];

// add
if (this._modifiedDeps.indexOf(dep) === -1) {
  this._modifiedDeps.push(dep);
}

// has
this._modifiedDeps.indexOf(dep) !== -1

// clear
this._modifiedDeps.length = 0;
```

**방법 2: epoch 기반** (더 빠름) - ✅ **채택됨**

```ts
private _modifiedEpoch = 0;

// 실행 시작
this._modifiedEpoch++;

// add: dep에 마킹
(dep as any)._modifiedAtEpoch = this._modifiedEpoch;

// has
(dep as any)._modifiedAtEpoch === this._modifiedEpoch

// clear: 필요 없음 (epoch 증가로 자동 무효화)
```

**중요 구현 사항 (히든 클래스 방어):**
Dependency를 구현하는 객체(`AtomImpl`, `ComputedImpl` 등)의 **생성자**에서 `_modifiedAtEpoch = -1` (또는 초기값)으로 필드를 미리 초기화해야 합니다. 나중에 동적으로 필드가 추가되면 V8 히든 클래스가 변경(Transition)되어 성능이 저하될 수 있습니다.

→ **방법 2 권장** (할당 없음, O(1))

---

## Phase 3: `debug.checkCircular` Set 제거 (dev only)

**현재**: 재귀 호출마다 visited Set 생성

```ts
checkCircular(dep: unknown, current: unknown, visited = new Set<unknown>()): void {
  if (visited.has(dep)) throw ...;
  visited.add(dep);
  for (const nestedDep of dep.dependencies) {
    this.checkCircular(nestedDep, current, visited);
  }
}
```

### 변경 후

**방법: 전역 epoch 사용**

```ts
let checkEpoch = 0;

checkCircular(dep: unknown, current: unknown): void {
  if (dep === current) throw ...;
  if (!this.enabled) return;
  
  checkEpoch++;
  this._checkCircularInternal(dep, current, checkEpoch);
}

private _checkCircularInternal(dep: unknown, current: unknown, epoch: number): void {
  const d = dep as { _visitedEpoch?: number };
  if (d._visitedEpoch === epoch) throw ...; // 이미 방문
  d._visitedEpoch = epoch;
  
  if (hasDependencies(dep)) {
    for (const nested of dep.dependencies) {
      this._checkCircularInternal(nested, current, epoch);
    }
  }
}
```

→ dev 모드 전용이라 우선순위 낮음

---

## 작업 순서

### 1단계 (필수, 효과 큼)

* [ ] `Computed._subscriptions` Map → Array
* [ ] `Effect._subscriptions` Map → Array  
* [ ] 벤치마크 재측정

### 2단계 (선택적)

* [ ] `Effect._modifiedDeps` Set → epoch 기반
* [ ] `debug.checkCircular` Set → epoch 기반

### 3단계 (검증)

* [ ] 전체 테스트 통과 확인
* [ ] 벤치마크 비교
* [ ] 메모리 프로파일링

---

## 예상 효과

| 항목 | Before | After (예상) |
| ------ | ------ | ------------ |
| Computed 생성 | 28.99K/s | ~1M ops/s 이상 |
| Effect 생성 | 87.02K/s | 3M+ ops/s (예상) |
| 전파 성능 | 유지 | 유지 or 개선 |

**목표**: alien-signals 생성 속도(1.9M~3.5M/s)와 동등하게 만들면서 전파 우위 유지

---

## 주의사항

1. **EMPTY_DEPS 패턴 유지**: `_unsubscribes`도 EMPTY_UNSUBS 상수 필요
2. **풀링 적용**: `_unsubscribes` 배열도 풀링하면 더 좋음
3. **indexOf 성능**: 의존성 10개 이하에선 Map.has보다 빠름 (캐시 효과)
4. **타입 안전성**: `_lastSeenEpoch`, `_modifiedAtEpoch` 등 Dependency 인터페이스에 추가 필요

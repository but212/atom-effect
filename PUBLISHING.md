# NPM 배포 가이드

이 문서는 `@but212/reactive-atom` 패키지를 npm에 배포하기 위한 체크리스트 및 가이드입니다.

## ✅ 완료된 준비 작업

### 1. 패키지 설정 개선

- ✅ `sideEffects: false` 추가 (Tree-shaking 지원)
- ✅ `exports` 필드에 타입 정의 경로 추가
- ✅ `canvas` 의존성을 `optionalDependencies`로 이동
- ✅ ~~`memwatch-next` 제거~~ (더 이상 유지보수 안 됨)

### 2. 필수 파일 생성

- ✅ `LICENSE` - MIT 라이센스 파일
- ✅ `CHANGELOG.md` - 버전 히스토리 문서
- ✅ `.github/workflows/ci.yml` - CI 자동화
- ✅ `.github/workflows/publish.yml` - NPM 배포 자동화
- ✅ `.github/workflows/benchmark.yml` - 성능 벤치마크

### 3. README 개선

- ✅ NPM 배지, CI 배지, 커버리지 배지 추가
- ✅ 번들 크기 배지 추가
- ✅ 벤치마크 결과 섹션 추가
- ✅ 테스트 커버리지 상세 정보 추가

## 📋 배포 전 체크리스트

### 필수 확인 사항

- [ ] **NPM 계정 준비**

  ```bash
  npm login
  # 또는
  npm adduser
  ```

- [ ] **GitHub Secrets 설정**
  - `NPM_TOKEN`: NPM 접근 토큰 (자동 배포용)
  - `CODECOV_TOKEN`: Codecov 업로드 토큰 (선택사항)

- [ ] **테스트 전체 통과**

  ```bash
  pnpm test -- --run
  pnpm typecheck
  ```

- [ ] **빌드 성공**

  ```bash
  pnpm build
  # dist/ 폴더 확인
  ```

- [ ] **package.json 버전 확인**
  - 현재: `1.0.0`
  - Semantic Versioning 준수

- [ ] **README.md 최종 검토**
  - 설치 명령어 정확성
  - 예제 코드 동작 확인
  - 링크 유효성 검증

## 🚀 배포 방법

### 방법 1: 수동 배포

```bash
# 1. 버전 확인
npm version

# 2. 빌드
pnpm build

# 3. 배포 (dry-run으로 먼저 테스트)
npm publish --dry-run

# 4. 실제 배포
npm publish --access public
```

### 방법 2: GitHub Release를 통한 자동 배포

1. **태그 생성 및 푸시**

   ```bash
   git tag -a v1.0.0 -m "Release v1.0.0"
   git push origin v1.0.0
   ```

2. **GitHub에서 Release 생성**
   - <https://github.com/but212/reactive-atom/releases/new>
   - 태그: `v1.0.0`
   - 제목: `v1.0.0 - Initial Release`
   - 설명: `CHANGELOG.md`의 v1.0.0 섹션 복사

3. **자동 배포 확인**
   - GitHub Actions에서 `Publish to NPM` 워크플로우 실행 확인
   - <https://github.com/but212/reactive-atom/actions>

## 📊 배포 후 확인 사항

### NPM 페이지 확인

- [ ] 패키지 페이지: <https://www.npmjs.com/package/@but212/reactive-atom>
- [ ] 버전 정보 정확성
- [ ] README 렌더링 확인
- [ ] 파일 목록 확인 (dist 폴더만 포함)

### 설치 테스트

```bash
# 새 프로젝트에서 설치 테스트
mkdir test-install
cd test-install
npm init -y
npm install @but212/reactive-atom

# 간단한 테스트
node -e "const { atom } = require('@but212/reactive-atom'); const a = atom(0); a.value = 1; console.log(a.value);"
```

### 번들 크기 확인

- [ ] <https://bundlephobia.com/package/@but212/reactive-atom>
- [ ] 목표: < 10KB (minified + gzipped)

### CI/CD 확인

- [ ] GitHub Actions 워크플로우 성공
- [ ] Codecov 커버리지 업로드 확인 (선택사항)
- [ ] 벤치마크 결과 아티팩트 생성 확인

## 🔧 GitHub Secrets 설정 방법

### NPM_TOKEN 생성

1. **NPM 웹사이트 로그인**
   - <https://www.npmjs.com/>

2. **Access Token 생성**
   - Profile → Access Tokens → Generate New Token
   - Token Type: **Automation** (CI/CD용)
   - 생성된 토큰 복사

3. **GitHub에 Secret 추가**
   - Repository → Settings → Secrets and variables → Actions
   - New repository secret
   - Name: `NPM_TOKEN`
   - Value: 복사한 토큰 붙여넣기

### CODECOV_TOKEN 설정 (선택사항)

1. **Codecov 계정 연동**
   - <https://codecov.io/>
   - GitHub 계정으로 로그인
   - Repository 추가

2. **토큰 복사**
   - Repository Settings → Upload token 복사

3. **GitHub Secret 추가**
   - Name: `CODECOV_TOKEN`
   - Value: 복사한 토큰

## 📈 배포 후 홍보

### npm 통계 추적

- **npm trends**: <https://npmtrends.com/@but212/reactive-atom>
- **npm stats**: <https://npm-stat.com/charts.html?package=@but212/reactive-atom>

### 커뮤니티 공유

- [ ] GitHub Discussions에 릴리즈 노트 공유
- [ ] Reddit r/typescript, r/javascript 커뮤니티
- [ ] Dev.to, Medium 등에 소개 글 작성
- [ ] Twitter/X에 공유

### 생태계 확장 계획

- [ ] React 바인딩 패키지 (`@but212/reactive-atom-react`)
- [ ] Vue 바인딩 패키지 (`@but212/reactive-atom-vue`)
- [ ] DevTools Chrome Extension
- [ ] 예제 프로젝트 저장소

## 🐛 문제 해결

### 배포 실패 시

**에러: 401 Unauthorized**

```bash
# NPM 재로그인
npm logout
npm login
```

**에러: 403 Forbidden**

- 패키지 이름이 이미 존재하는지 확인
- `package.json`의 `name` 필드 확인
- `publishConfig.access`가 `public`인지 확인

**에러: 버전 충돌**

```bash
# 버전 업데이트
npm version patch  # 1.0.0 → 1.0.1
npm version minor  # 1.0.0 → 1.1.0
npm version major  # 1.0.0 → 2.0.0
```

### CI/CD 실패 시

**테스트 실패**

- 로컬에서 `pnpm test -- --run` 실행하여 재현
- 환경별 이슈일 경우 CI 설정 조정

**빌드 실패**

- TypeScript 버전 확인
- 의존성 설치 확인: `pnpm install --frozen-lockfile`

## 📚 참고 자료

- [npm 배포 가이드](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages)
- [GitHub Actions 문서](https://docs.github.com/en/actions)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)

## 📞 도움이 필요하면

- GitHub Issues: <https://github.com/but212/reactive-atom/issues>
- Email: (이메일 추가)
- Discussions: <https://github.com/but212/reactive-atom/discussions>

---

**마지막 업데이트**: 2025-10-08
**작성자**: Jeongil Suk

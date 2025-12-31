import { Dependency } from '../types';

export class DependencyManager {
  private depMap = new WeakMap<Dependency, () => void>();
  private depRefs: WeakRef<Dependency>[] = [];
  private cleanupThreshold = 100;
  private addCount = 0;

  addDependency(dep: Dependency, unsubscribe: () => void): void {
    if (this.depMap.has(dep)) {
      unsubscribe();
      return;
    }

    this.depMap.set(dep, unsubscribe);
    this.depRefs.push(new WeakRef(dep));

    if (++this.addCount >= this.cleanupThreshold) {
      this.cleanup();
      this.addCount = 0;
    }
  }

  removeDependency(dep: Dependency): boolean {
    const unsubscribe = this.depMap.get(dep);
    if (unsubscribe) {
      try {
        unsubscribe();
      } catch (error) {
        console.warn('[DependencyManager] Error during unsubscribe:', error);
      }
      this.depMap.delete(dep);
      return true;
    }
    return false;
  }

  hasDependency(dep: Dependency): boolean {
    return this.depMap.has(dep);
  }

  unsubscribeAll(): void {
    for (let i = 0; i < this.depRefs.length; i++) {
      const dep = this.depRefs[i]!.deref();
      if (dep) {
        const unsubscribe = this.depMap.get(dep);
        if (unsubscribe) {
          try {
            unsubscribe();
          } catch (error) {
            console.warn('[DependencyManager] Error during unsubscribe:', error);
          }
          this.depMap.delete(dep);
        }
      }
    }
    this.depRefs.length = 0;
    this.addCount = 0;
  }

  cleanup(): void {
    this.depRefs = this.depRefs.filter((ref) => ref.deref() !== undefined);
  }

  get count(): number {
    this.cleanup();
    return this.depRefs.length;
  }

  getDependencies(): Dependency[] {
    const liveDeps: Dependency[] = [];
    for (let i = 0; i < this.depRefs.length; i++) {
      const dep = this.depRefs[i]!.deref();
      if (dep !== undefined) {
        liveDeps.push(dep);
      }
    }
    return liveDeps;
  }

  getDepMap(): WeakMap<Dependency, () => void> {
    return this.depMap;
  }

  setCleanupThreshold(threshold: number): void {
    this.cleanupThreshold = Math.max(1, threshold);
  }
}

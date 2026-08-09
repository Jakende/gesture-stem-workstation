import { createEmptyProject, deserializeProject, serializeProject, type Project } from "@gsw/project-schema";

type ProjectListener = (project: Project) => void;

export class ProjectStore {
  #project: Project;
  #listeners = new Set<ProjectListener>();

  constructor(project: Project = createEmptyProject("Nazca Lines — performance")) {
    this.#project = structuredClone(project);
  }

  get snapshot(): Project {
    return structuredClone(this.#project);
  }

  subscribe(listener: ProjectListener): () => void {
    this.#listeners.add(listener);
    listener(this.snapshot);
    return () => this.#listeners.delete(listener);
  }

  update(mutator: (project: Project) => void): void {
    const next = structuredClone(this.#project);
    mutator(next);
    this.#project = next;
    this.#notify();
  }

  replace(project: Project): void {
    this.#project = structuredClone(project);
    this.#notify();
  }

  serialize(): string {
    return serializeProject(this.#project);
  }

  load(serialized: string): void {
    this.replace(deserializeProject(serialized));
  }

  #notify(): void {
    const snapshot = this.snapshot;
    for (const listener of this.#listeners) listener(snapshot);
  }
}

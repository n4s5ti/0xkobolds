/**
 * SkillStore
 * 
 * Manages the list of available skills and their hot-reload state
 * in the renderer process.
 */

import { state } from "@mariozechner/mini-lit";
import type { SerializableSkill } from "../shared/api-types";

export class SkillStore {
  @state()
  public skills: SerializableSkill[] = [];

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    try {
      this.skills = await window.koboldAPI.skills.list();
    } catch (err) {
      console.error("[SkillStore] Failed to load skills:", err);
    }
  }

  /**
   * Update skills list from main process reload event
   */
  updateSkills(newSkills: SerializableSkill[]): void {
    this.skills = newSkills;
  }
}

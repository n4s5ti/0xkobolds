import { describe, test, expect } from "bun:test";
import { FileContextExtractor } from "../../dist/generator/file-context.js";

describe("File Context Extractor", () => {

  test("extracts TODOs from code", () => {
    const extractor = new FileContextExtractor();
    const code = `
      function test() {
        // TODO: implement this
        // TODO: add error handling
      }
    `;
    const todos = extractor.extractTodos(code);
    expect(todos.length).toBe(2);
    expect(todos[0]).toContain("implement this");
  });

  test("extracts FIXMEs from code", () => {
    const extractor = new FileContextExtractor();
    const code = `
      // FIXME: this is broken
      // FIXME: memory leak here
    `;
    const fixmes = extractor.extractFixmes(code);
    expect(fixmes.length).toBe(2);
  });

  test("extracts function signatures", () => {
    const extractor = new FileContextExtractor();
    const code = `
      function processUserData(user, options) {
        // implementation
      }
    `;
    const funcs = extractor.extractFunctions(code);
    expect(funcs.length).toBeGreaterThanOrEqual(1);
    expect(funcs.some(f => f.name === "processUserData")).toBe(true);
  });

  test("extracts imports", () => {
    const extractor = new FileContextExtractor();
    const code = `
      import { useState } from 'react';
      import type { User } from './types';
      import fs from 'fs';
    `;
    const imports = extractor.extractImports(code);
    expect(imports.length).toBeGreaterThanOrEqual(2);
  });

  test("extracts language/framework", () => {
    const extractor = new FileContextExtractor();
    // Need multiple TS indicators
    const tsCode = "const x: number = 1; const y: string = 'hi';";
    expect(extractor.detectLanguage(tsCode)).toBe("typescript");

    const pyCode = "def foo():\n    pass";
    expect(extractor.detectLanguage(pyCode)).toBe("python");
  });

  test("builds context summary", () => {
    const extractor = new FileContextExtractor();
    const code = `
      // TODO: add tests
      import { api } from './api';
      
      function fetchData(id) {
        return api.get(id);
      }
    `;
    const context = extractor.buildFileContext(code, "/src/data.ts");
    
    expect(context).toHaveProperty("filePath");
    expect(context).toHaveProperty("language");
    expect(context).toHaveProperty("todos");
    expect(context).toHaveProperty("fixmes");
    expect(context).toHaveProperty("functions");
    expect(context).toHaveProperty("imports");
  });
});

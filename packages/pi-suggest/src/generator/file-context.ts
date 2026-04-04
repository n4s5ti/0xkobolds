export interface FileContext {
  filePath: string;
  language: string;
  todos: string[];
  fixmes: string[];
  functions: Array<{ name: string; signature: string }>;
  imports: string[];
}

export class FileContextExtractor {
  extractTodos(code: string): string[] {
    const pattern = /\/\/\s*TODO:?\s*(.+)/gi;
    const matches: string[] = [];
    let match;
    while ((match = pattern.exec(code)) !== null) {
      matches.push(match[1].trim());
    }
    return matches;
  }

  extractFixmes(code: string): string[] {
    const pattern = /\/\/\s*FIXME:?\s*(.+)/gi;
    const matches: string[] = [];
    let match;
    while ((match = pattern.exec(code)) !== null) {
      matches.push(match[1].trim());
    }
    return matches;
  }

  extractFunctions(code: string): Array<{ name: string; signature: string }> {
    const functions: Array<{ name: string; signature: string }> = [];
    
    // TypeScript/JavaScript function patterns
    const patterns = [
      /function\s+(\w+)\s*\([^)]*\)/g,
      /(?:const|let|var)\s+(\w+)\s*[=:]\s*(?:async\s*)?(?:function|\([^)]*\))\s*(?:=>)?\s*[{(]/g,
      /(?:async\s+)?(\w+)\s*[=:]\s*(?:async\s*)?\([^)]*\)\s*(?::\s*\w+)?\s*(?:=>)?\s*[{(]/g,
      // Python
      /(?:def|async\s+def)\s+(\w+)\s*\([^)]*\)\s*(?:->\s*\S+)?:/gm,
      // Rust
      /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g,
      // Go
      /func\s+(?:\([^)]+\)\s+)?(\w+)/g,
    ];

    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(code)) !== null) {
        if (match[1] && !match[1].startsWith("_") && !["if", "else", "for", "while", "switch", "catch"].includes(match[1])) {
          functions.push({
            name: match[1],
            signature: match[0].slice(0, 100),
          });
        }
      }
    }

    return functions;
  }

  extractImports(code: string): string[] {
    const imports: string[] = [];
    
    const patterns = [
      /import\s+(?:{[^}]+}|\w+)\s+from\s+['"]([^'"]+)['"]/g,
      /import\s+['"]([^'"]+)['"]/g,
      /require\s*\(['"]([^'"]+)['"]\)/g,
    ];

    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(code)) !== null) {
        imports.push(match[1]);
      }
    }

    return [...new Set(imports)];
  }

  detectLanguage(code: string): string {
    // TypeScript: has type annotations
    const tsIndicators = [
      /:\s*\w+\s*[=,;|]/,
      /\w+:\s*(?:string|number|boolean|void|any)\b/,
    ];
    if (tsIndicators.filter(r => r.test(code)).length >= 1) {
      return "typescript";
    }
    
    // Python: def or class with colon
    if (/\bdef\b/.test(code) && /:\s*$/m.test(code)) {
      return "python";
    }
    if (/\bclass\b.*:/.test(code)) {
      return "python";
    }
    
    // Rust: fn with braces
    if (/\bfn\b/.test(code) && /[{}]/.test(code)) {
      return "rust";
    }
    
    // Go: func and package
    if (/\bfunc\b/.test(code) && /\bpackage\b/.test(code)) {
      return "go";
    }
    
    // JavaScript: const, let, function
    if (/\b(const|let|function)\b/.test(code)) {
      return "javascript";
    }
    
    return "unknown";
  }

  buildFileContext(code: string, filePath: string): FileContext {
    return {
      filePath,
      language: this.detectLanguage(code),
      todos: this.extractTodos(code),
      fixmes: this.extractFixmes(code),
      functions: this.extractFunctions(code),
      imports: this.extractImports(code),
    };
  }
}

export default FileContextExtractor;

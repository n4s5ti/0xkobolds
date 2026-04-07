declare module "sql.js" {
  export class Database {
    constructor(data?: ArrayLike<number> | BufferSource);
    run(sql: string, params?: any[]): Database;
    exec(sql: string, params?: any[]): any[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
    getRowsModified(): number;
  }
  export interface Statement {
    bind(params?: any[]): boolean;
    step(): boolean;
    getAsObject(): any;
    free(): boolean;
  }
  export interface SqlJsStatic {
    Database: typeof Database;
  }
  export default function initSqlJs(config?: any): Promise<SqlJsStatic>;
}

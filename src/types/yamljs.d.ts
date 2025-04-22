// types/yamljs.d.ts
declare module 'yamljs' {
    export function load(path: string): any;
    export function parse(text: string): any;
    export function stringify(obj: any, inline?: number, spaces?: number): string;
  }
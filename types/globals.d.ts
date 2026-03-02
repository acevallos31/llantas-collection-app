declare const Deno: {
  env: { get(name: string): string | undefined; };
  serve?: any;
  [key: string]: any;
};
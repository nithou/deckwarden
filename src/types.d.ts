declare module "*.svg" {
  const content: string;
  export default content;
}

declare module "*.png" {
  const content: string;
  export default content;
}

declare module "*.jpg" {
  const content: string;
  export default content;
}

// Decky Loader's frontend bridge to its backend routes (global in SharedJSContext)
interface Window {
  DeckyBackend: {
    call<T = unknown>(route: string, ...args: unknown[]): Promise<T>;
  };
}

import { useEffect, useState } from "react";

const jsContextState: Record<string, any> = {};

export const useJsContextState = <T>(
  key: string,
  initialValue: T
): [T, (value: T) => Promise<void>] => {
  const [state, _setState] = useState<T>(initialValue);

  useEffect(() => {
    _setState(jsContextState[key] ?? initialValue);
  }, []);

  const setState = async (value: T) => {
    jsContextState[key] = value;
    _setState(value);
  };

  return [state ?? initialValue, setState];
};

// Reset values that survive panel re-mounts (e.g. when the vault is locked
// while the Quick Access Menu is closed).
export const clearJsContextState = (...keys: string[]) => {
  for (const key of keys) {
    delete jsContextState[key];
  }
};

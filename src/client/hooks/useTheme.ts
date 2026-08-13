import { useEffect } from "react";
import { useStore } from "../store/scripts";

export function useTheme() {
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return theme;
}

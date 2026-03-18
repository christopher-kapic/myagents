import { jsx as _jsx } from "react/jsx-runtime";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import * as React from "react";
export function ThemeProvider({ children, ...props }) {
    return _jsx(NextThemesProvider, { ...props, children: children });
}
export { useTheme } from "next-themes";

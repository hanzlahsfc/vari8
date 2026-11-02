import type { CSSProperties, ReactNode } from "react";
import {
  type Vari8Mode,
  type Vari8Theme,
  vari8Theme,
} from "@/lib/canvas/vari8-theme";

type Vari8Style = CSSProperties & Vari8Theme;

export function ThemeScope({
  mode,
  accent,
  children,
  className,
  style: customStyle,
}: {
  mode: Vari8Mode;
  accent: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const style: Vari8Style = {
    ...vari8Theme({ mode, accent }),
    ...customStyle,
  };
  const classes = ["v8-theme", "v8-scope", className].filter(Boolean).join(" ");

  return (
    <div className={classes} data-mode={mode} style={style}>
      {children}
    </div>
  );
}

import type { SVGProps } from "react";
import brandSymbol from "../../config/brand-symbol.json";
import { cn } from "@/lib/utils";

type BrandSymbolPathsProps = {
  primaryColor?: string;
  secondaryColor?: string;
};

export function BrandSymbolPaths({ primaryColor = "currentColor", secondaryColor }: BrandSymbolPathsProps) {
  return (
    <>
      <path d={brandSymbol.leftPath} fill={primaryColor} />
      <path d={brandSymbol.rightPath} fill={secondaryColor ?? primaryColor} opacity={secondaryColor ? undefined : 0.55} />
      <rect {...brandSymbol.bridge} fill={primaryColor} />
    </>
  );
}

type BrandMarkProps = Omit<SVGProps<SVGSVGElement>, "children" | "color" | "viewBox"> & BrandSymbolPathsProps;

export function BrandMark({ className, primaryColor, secondaryColor, ...props }: BrandMarkProps) {
  return (
    <svg
      {...props}
      viewBox={brandSymbol.inlineViewBox}
      aria-hidden="true"
      focusable="false"
      data-moneva-brand-symbol={`v${brandSymbol.version}`}
      className={cn("size-8 shrink-0 text-primary", className)}
    >
      <BrandSymbolPaths primaryColor={primaryColor} secondaryColor={secondaryColor} />
    </svg>
  );
}

type BrandAppIconProps = BrandMarkProps & { backgroundColor: string };

export function BrandAppIcon({ backgroundColor, className, primaryColor, secondaryColor, ...props }: BrandAppIconProps) {
  return (
    <svg
      {...props}
      viewBox={brandSymbol.viewBox}
      aria-hidden="true"
      focusable="false"
      data-moneva-brand-symbol={`v${brandSymbol.version}`}
      className={cn("shrink-0", className)}
    >
      <rect width="512" height="512" rx="120" fill={backgroundColor} />
      <BrandSymbolPaths primaryColor={primaryColor} secondaryColor={secondaryColor} />
    </svg>
  );
}

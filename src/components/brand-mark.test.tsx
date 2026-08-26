import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import brandSymbol from "../../config/brand-symbol.json";
import { BrandAppIcon, BrandMark } from "@/components/brand-mark";

describe("Moneva brand mark", () => {
  it("renders the canonical geometry at every inline size", () => {
    const compact = renderToStaticMarkup(<BrandMark className="size-4" />);
    const large = renderToStaticMarkup(<BrandMark className="size-16" />);

    for (const markup of [compact, large]) {
      expect(markup).toContain(`data-moneva-brand-symbol="v${brandSymbol.version}"`);
      expect(markup).toContain(`viewBox="${brandSymbol.inlineViewBox}"`);
      expect(markup).toContain(`d="${brandSymbol.leftPath}"`);
      expect(markup).toContain(`d="${brandSymbol.rightPath}"`);
      expect(markup).toContain(`x="${brandSymbol.bridge.x}"`);
      expect(markup).not.toContain("skew");
    }
  });

  it("uses the same symbol inside the themed app tile", () => {
    const markup = renderToStaticMarkup(
      <BrandAppIcon backgroundColor="#101512" primaryColor="#36D399" secondaryColor="#168D70" />,
    );

    expect(markup).toContain(`viewBox="${brandSymbol.viewBox}"`);
    expect(markup).toContain(`d="${brandSymbol.leftPath}"`);
    expect(markup).toContain(`d="${brandSymbol.rightPath}"`);
    expect(markup).toContain('fill="#36D399"');
    expect(markup).toContain('fill="#168D70"');
  });
});

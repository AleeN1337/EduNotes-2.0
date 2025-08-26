import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("utils.cn", () => {
  it("merges conditional class names", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
    expect(cn("a", true && "b", "c")).toBe("a b c");
  });

  it("dedupes tailwind classes intelligently", () => {
    // tailwind-merge should resolve the latter conflicting classes
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
  });
});

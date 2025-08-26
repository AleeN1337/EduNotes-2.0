import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// JSDOM doesn't implement scrollIntoView; provide a harmless stub
if (typeof window !== "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window.HTMLElement as any).prototype.scrollIntoView = function () {
    // no-op
  };
}

// Mock @mui/icons-material to a lightweight stub to avoid EMFILE on Windows
vi.mock("@mui/icons-material", async () => {
  const React = await import("react");
  const Stub: React.FC<any> = (props) => React.createElement("span", props);
  // Provide a default export proxy where any icon access returns the Stub
  return new Proxy(
    { __esModule: true, Login: Stub },
    {
      get: (target, prop) => (prop in target ? (target as any)[prop] : Stub),
    }
  ) as any;
});

import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renders the header with connection status", () => {
    render(<App />);
    expect(screen.getByText("No device")).toBeDefined();
  });

  it("renders all five tab buttons", () => {
    render(<App />);
    const nav = screen.getByRole("navigation");
    expect(nav).toBeDefined();
    const buttons = screen.getAllByRole("button");
    const tabNames = ["Overview", "Mixer", "Patchbay", "Matrix", "Settings"];
    for (const name of tabNames) {
      expect(buttons.some((b) => b.textContent === name)).toBe(true);
    }
  });

  it("shows Overview tab content by default", () => {
    render(<App />);
    // Overview now shows real content with mock device state
    expect(screen.getByText("Inputs")).toBeDefined();
    expect(screen.getByText("Outputs")).toBeDefined();
  });

  it("switches tabs when clicked", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Mixer"));
    // Mixer tab shows bus selector
    expect(screen.getByText("Mix Bus:")).toBeDefined();
  });

  it("renders the footer", () => {
    render(<App />);
    expect(screen.getByText("RedMatrix v0.1.0")).toBeDefined();
  });
});

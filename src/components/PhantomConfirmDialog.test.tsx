import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PhantomConfirmDialog from "./PhantomConfirmDialog";

describe("PhantomConfirmDialog", () => {
  it("renders warning text with the input group name", () => {
    render(
      <PhantomConfirmDialog group="inputs 1-4" onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.getByText(/inputs 1-4/)).toBeDefined();
    expect(screen.getByText(/can damage ribbon/i)).toBeDefined();
  });

  it("calls onCancel when Cancel is clicked", () => {
    const onCancel = vi.fn();
    render(
      <PhantomConfirmDialog group="inputs 1-4" onConfirm={vi.fn()} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls onConfirm when Enable 48V is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <PhantomConfirmDialog group="inputs 1-4" onConfirm={onConfirm} onCancel={vi.fn()} />
    );
    fireEvent.click(screen.getByText("Enable 48V"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("does not call onConfirm when Cancel is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <PhantomConfirmDialog group="inputs 1-4" onConfirm={onConfirm} onCancel={vi.fn()} />
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

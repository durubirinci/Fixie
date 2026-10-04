import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountSection } from "@/components/ui/account-section";

describe("AccountSection", () => {
  it("renders nothing when Supabase isn't configured", () => {
    const { container } = render(
      <AccountSection account={{ status: "unavailable" }} onSignIn={vi.fn()} onSignOut={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers Sign in with Google when signed out", () => {
    render(<AccountSection account={{ status: "signed_out" }} onSignIn={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Sign in with Google" })).toBeInTheDocument();
  });

  it("shows the first name and a sign-out button when signed in", () => {
    render(
      <AccountSection
        account={{ status: "signed_in", userId: "u1", firstName: "Duru" }}
        onSignIn={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );
    expect(screen.getByText(/Signed in as Duru/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});

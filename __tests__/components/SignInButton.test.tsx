/**
 * Example component test for the SignInButton.
 * Demonstrates how to test a client component with testing-library.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock next-auth/react
const mockSignIn = vi.fn();
vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

import { SignInButton } from "@/app/login/ui";

describe("SignInButton", () => {
  it("renders the sign-in button", () => {
    render(<SignInButton />);
    expect(screen.getByRole("button", { name: /sign in with azure ad/i })).toBeInTheDocument();
  });

  it("calls signIn with azure-ad on click", async () => {
    const user = userEvent.setup();
    render(<SignInButton />);

    await user.click(screen.getByRole("button"));

    expect(mockSignIn).toHaveBeenCalledWith("azure-ad", { callbackUrl: "/" });
  });
});

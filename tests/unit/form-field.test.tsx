import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FormField, FormMessage } from "@/components/form-field";
import { initials } from "@/components/user-avatar";

describe("FormField", () => {
  it("connects the label, hint and input for assistive technology", () => {
    render(<FormField label="Workspace name" name="name" hint="Usually your team name." />);

    const input = screen.getByLabelText("Workspace name");
    expect(input).toHaveAccessibleDescription("Usually your team name.");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("marks the input invalid and announces the error instead of the hint", () => {
    render(<FormField label="Email" name="email" hint="We never share it." errors={["Enter a valid email address."]} />);

    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Enter a valid email address.");
    expect(screen.queryByText("We never share it.")).not.toBeInTheDocument();
  });
});

describe("FormMessage", () => {
  it("renders nothing before the form is submitted", () => {
    const { container } = render(<FormMessage state={{ status: "idle" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the message after a submit", () => {
    render(<FormMessage state={{ status: "error", message: "You don't have permission to do that." }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("You don't have permission to do that.");
  });
});

describe("initials", () => {
  it("uses first and last name, falling back to the email", () => {
    expect(initials("Ada Grace Obi", "ada@example.com")).toBe("AO");
    expect(initials("", "ada@example.com")).toBe("AD");
  });
});

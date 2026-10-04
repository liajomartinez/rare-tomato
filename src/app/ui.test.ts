import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SignedInAs } from "./ui";

describe("the signed-in line", () => {
  it("shows the account so people with two accounts can tell them apart", () => {
    const html = renderToStaticMarkup(createElement(SignedInAs, { email: "juliet@example.test" }));
    expect(html).toContain("Signed in as");
    expect(html).toContain("juliet@example.test");
    expect(html).toContain("different account");
  });

  it("shows nothing when there is no email", () => {
    expect(renderToStaticMarkup(createElement(SignedInAs, { email: null }))).toBe("");
  });

  it("shows an email as plain text, even a hostile one", () => {
    const html = renderToStaticMarkup(createElement(SignedInAs, { email: "<script>alert(1)</script>@x.test" }));
    expect(html).not.toContain("<script");
  });
});

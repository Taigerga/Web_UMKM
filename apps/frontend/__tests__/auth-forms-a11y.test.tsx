import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as React from "react";

import { Field, fieldErrorId } from "@/components/ui";
import { LoginForm } from "@/components/auth/login-form";
import { RegisterForm } from "@/components/auth/register-form";

// `globals: false` di `vitest.config.mts` membuat auto-cleanup Testing Library
// TIDAK terdaftar, jadi DOM dari test sebelumnya bocor ke test berikutnya.
// Tanpa baris ini `getByLabelText("Email")` bisa mengenai input milik test
// sebelumnya, dan assertion-nya jadi tidak menguji apa pun.
afterEach(cleanup);

/** Body respons validasi, disalin dari respons backend sungguhan. */
function validationResponse(details: string[]) {
  return new Response(
    JSON.stringify({
      error: {
        code: "VALIDATION_ERROR",
        message: "Permintaan tidak valid.",
        details,
      },
    }),
    { status: 400, headers: { "Content-Type": "application/json" } },
  );
}

/** Pasang fetch yang selalu membalas validasi dengan `details`. */
function stubValidation(details: string[]) {
  const fetchMock = vi.fn().mockImplementation(async () => validationResponse(details));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Klik submit dan tunggu semua promise yang dibangkitkan selesai. */
async function clickSubmit(name: RegExp) {
  const submit = screen.getByRole("button", { name });
  await React.act(async () => {
    submit.click();
  });
}

describe("Field: id pesan galat", () => {
  it("memberi pesan galat id yang diturunkan dari id kontrol", () => {
    render(
      <Field label="Email" htmlFor="email" error="email tidak valid">
        <input id="email" />
      </Field>,
    );

    const alert = screen.getByRole("alert");
    expect(alert.id).toBe(fieldErrorId("email"));
    expect(alert.id).toBe("email-error");
  });

  it("fieldErrorId menurunkan dari id kontrol, bukan nama tetap", () => {
    expect(fieldErrorId("passwordConfirmation")).toBe("passwordConfirmation-error");
    expect(fieldErrorId("email")).not.toBe(fieldErrorId("password"));
  });

  it("tidak merender elemen galat saat field bersih", () => {
    render(
      <Field label="Email" htmlFor="email">
        <input id="email" />
      </Field>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("memberi id juga pada pesan bantuan", () => {
    render(
      <Field label="Email" htmlFor="email" hint="Minimal 8 karakter.">
        <input id="email" />
      </Field>,
    );
    expect(screen.getByText("Minimal 8 karakter.").id).toBe("email-hint");
  });
});

describe("LoginForm: aria-describedby menunjuk elemen yang ada", () => {
  it("menunjuk id yang benar-benar ada di DOM", async () => {
    stubValidation(["email harus berupa alamat email yang valid"]);
    render(<LoginForm />);
    await clickSubmit(/Masuk/);

    const email = screen.getByLabelText("Email");
    const describedBy = email.getAttribute("aria-describedby");

    // Nilai harus ada, dan harus menunjuk elemen nyata. Rujukan ke id yang
    // tidak ada di DOM diam-diam diabaikan peramban: tidak ada error, tidak
    // ada peringatan, dan pesan galatnya tidak pernah dibacakan.
    expect(describedBy).toBe("email-error");
    const target = document.getElementById(describedBy!);
    expect(target).not.toBeNull();
    expect(target!.textContent).toBe("email harus berupa alamat email yang valid");
  });
});

describe("RegisterForm: detail yang tidak bisa dipetakan tetap ditampilkan", () => {
  it("menampilkan `property role should not exist` di level form", async () => {
    stubValidation([
      "property role should not exist",
      "email harus berupa alamat email yang valid",
    ]);
    render(<RegisterForm />);
    await clickSubmit(/Buat akun/);

    // Inilah pelanggaran kontrak R-35. Kalau hilang, form yang paling mungkin
    // mengirim `role` justru yang paling diam tentang masalahnya.
    expect(screen.getAllByText("property role should not exist").length).toBeGreaterThan(0);

    // Detail yang bisa dipetakan tetap muncul di bawah input-nya.
    expect(
      screen.getByText("email harus berupa alamat email yang valid"),
    ).toBeDefined();
  });

  it("detail yang seluruhnya tak terpetakan tetap tampil", async () => {
    stubValidation(["property role should not exist"]);
    render(<RegisterForm />);
    await clickSubmit(/Buat akun/);
    expect(screen.getAllByText("property role should not exist").length).toBeGreaterThan(0);
  });

  it("RegisterForm punya aria-describedby seperti LoginForm", async () => {
    stubValidation(["name minimal 2 karakter"]);
    render(<RegisterForm />);
    await clickSubmit(/Buat akun/);

    const name = screen.getByLabelText("Nama");
    const describedBy = name.getAttribute("aria-describedby");
    expect(describedBy).toBe("name-error");
    expect(document.getElementById(describedBy!)).not.toBeNull();
  });

  it("tidak menampilkan blok level form saat tidak ada detail", () => {
    stubValidation(["email harus berupa alamat email yang valid"]);
    render(<RegisterForm />);
    expect(screen.queryAllByText(/Periksa kembali isian yang ditandai/).length).toBe(0);
  });
});

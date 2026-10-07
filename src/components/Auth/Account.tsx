import { Link, useNavigate } from "react-router";

import { useChangePassword, useLogout } from "../../store/api";
import {
  AuthPage,
  Field,
  FormError,
  SubmitButton,
  formValues,
} from "./AuthForm";
import { useUser } from "./RequireAuth";

export function Account() {
  const user = useUser();
  const changePassword = useChangePassword();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <AuthPage title="Account">
      <Link to="/" className="text-fuchsia-400 underline">
        Back to your character
      </Link>

      <div className="flex flex-col gap-1 my-8">
        {user.name && <span className="text-lg">{user.name}</span>}
        <span className="text-stone-400">{user.email}</span>
      </div>

      <h3 className="text-label mb-4">Change password</h3>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const { currentPassword, newPassword } = formValues(form);
          changePassword.mutate(
            { currentPassword, newPassword },
            { onSuccess: () => form.reset() },
          );
        }}
      >
        <Field
          label="Current password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
        <Field
          label="New password (8+ characters)"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <FormError error={changePassword.error} />
        {changePassword.isSuccess && (
          <p role="status" className="text-emerald-400">
            Password changed.
          </p>
        )}
        <SubmitButton pending={changePassword.isPending}>
          Change password
        </SubmitButton>
      </form>

      <div className="mt-12 flex flex-col gap-2 items-start">
        <button
          type="button"
          disabled={logout.isPending}
          className="cursor-pointer text-fuchsia-400 underline disabled:cursor-wait disabled:opacity-50"
          onClick={() =>
            logout.mutate(undefined, {
              onSuccess: () => navigate("/login", { replace: true }),
            })
          }
        >
          {logout.isPending ? "Signing out..." : "Sign out"}
        </button>
        {logout.error && (
          <p role="alert" className="text-red-400">
            Couldn't sign out: {logout.error.message}. You're still signed in.
          </p>
        )}
      </div>
    </AuthPage>
  );
}

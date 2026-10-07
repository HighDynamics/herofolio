import { useSuspenseQuery } from "@tanstack/react-query";
import { Navigate, Outlet, useLocation } from "react-router";

import { queries } from "../../store/api";

/** Layout route: renders its children only for a signed-in user. */
export function RequireAuth() {
  const user = useSuspenseQuery(queries.me).data;
  const { pathname } = useLocation();

  if (!user) {
    const next =
      pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return <Navigate to={`/login${next}`} replace />;
  }
  return <Outlet />;
}

/** The signed-in user, for components under RequireAuth. */
export function useUser() {
  const user = useSuspenseQuery(queries.me).data;
  if (!user) throw new Error("useUser is only for signed-in pages");
  return user;
}

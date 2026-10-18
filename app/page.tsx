import { redirect } from "next/navigation";

/**
 * La raíz no tiene contenido propio: entramos directo al panel.
 * Si no hay sesión, el middleware de /dashboard redirige a /login.
 */
export default function Home(): never {
  redirect("/dashboard");
}

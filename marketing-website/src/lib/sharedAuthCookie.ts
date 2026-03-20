const SHARED_AUTH_COOKIE_NAME = "janso_authenticated";

export function readSharedAuthCookie(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${SHARED_AUTH_COOKIE_NAME}=`));

  return match?.split("=")[1] === "1";
}

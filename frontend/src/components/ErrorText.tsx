import { CircleAlert } from "lucide-react";

/** Error message with an icon and text, so the error is never signalled by colour alone. */
export default function ErrorText({ children, id }: { children: React.ReactNode; id?: string }) {
  return <p id={id} className="error" role="alert"><CircleAlert size={18} aria-hidden="true" /><span>{children}</span></p>;
}

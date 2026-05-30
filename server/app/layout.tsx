import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "Web Passport",
  description: "A consul at the border of every website.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body
          style={{
            margin: 0,
            fontFamily: "system-ui, sans-serif",
            background: "#0f1020",
            color: "#f4f4f8",
          }}
        >
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}

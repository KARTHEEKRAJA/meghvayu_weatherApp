import "./globals.css";

export const metadata = {
  title: "MeghVayu : Weather App | PM Accelerator Assessment",
  description:
    "Full-stack weather app: real-time conditions, 5-day forecast, and weather history with CRUD + export.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-display antialiased">{children}</body>
    </html>
  );
}

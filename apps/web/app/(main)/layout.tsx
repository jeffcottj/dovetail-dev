export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <a href="#main-content" className="skip-to-content">
        Skip to content
      </a>
      {children}
    </div>
  );
}

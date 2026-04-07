import WorkspaceSidebar from './WorkspaceSidebar';

export default function WorkspaceLayout({ section, children }) {
  return (
    <div className="flex min-h-[calc(100vh-64px)]">
      <WorkspaceSidebar section={section} />
      <main className="flex-1 bg-neutral-50 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

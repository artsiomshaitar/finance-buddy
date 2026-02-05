import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
	component: SettingsLayout,
});

function subPageTitle(pathname: string): string | null {
	const normalized = pathname.replace(/\/$/, "") || "/";
	if (normalized === "/settings") return null;
	const segments = normalized.split("/").filter(Boolean);
	const last = segments[segments.length - 1];
	if (!last) return null;
	return last.charAt(0).toUpperCase() + last.slice(1).toLowerCase();
}

function SettingsLayout() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const subTitle = subPageTitle(pathname);
	return (
		<div className="min-h-screen bg-background font-mono p-6">
			<h1 className="text-xl font-semibold mb-4">
				{subTitle ? (
					<>
						<Link to="/settings" className="hover:text-primary hover:underline">
							Settings
						</Link>
						{" / "}
						{subTitle}
					</>
				) : (
					"Settings"
				)}
			</h1>
			<Outlet />
		</div>
	);
}

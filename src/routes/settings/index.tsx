import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/")({
	component: SettingsIndexPage,
});

function SettingsIndexPage() {
	return (
		<div>
			<ul className="space-y-2">
				<li>
					<Link
						to="/settings/categories"
						className="block p-3 border border-border hover:bg-accent hover:text-accent-foreground transition-colors rounded-none"
					>
						<span className="font-medium">Category settings</span>
						<span className="text-muted-foreground text-sm block mt-1">
							Edit category names, icons, and options
						</span>
					</Link>
				</li>
			</ul>
		</div>
	);
}

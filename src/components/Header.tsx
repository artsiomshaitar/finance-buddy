import {
	ChartPieIcon,
	ChatCircleIcon,
	DatabaseIcon,
	ListIcon,
	XIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

export default function Header() {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<>
			<header className="p-4 flex items-center bg-background text-foreground border-b border-border">
				<button
					type="button"
					onClick={() => setIsOpen(true)}
					className="p-2 hover:bg-accent hover:text-accent-foreground rounded-none transition-colors"
					aria-label="Open menu"
				>
					<ListIcon size={24} />
				</button>
				<h1 className="ml-4 text-xl font-semibold font-mono">
					<Link to="/dashboard">finance-cli</Link>
				</h1>
			</header>

			<aside
				className={`fixed top-0 left-0 h-full w-80 bg-card text-foreground border-r border-border z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
					isOpen ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				<div className="flex items-center justify-between p-4 border-b border-border">
					<h2 className="text-xl font-bold">Navigation</h2>
					<button
						type="button"
						onClick={() => setIsOpen(false)}
						className="p-2 hover:bg-accent hover:text-accent-foreground rounded-none transition-colors"
						aria-label="Close menu"
					>
						<XIcon size={24} />
					</button>
				</div>

				<nav className="flex-1 p-4 overflow-y-auto font-mono">
					<Link
						to="/dashboard"
						onClick={() => setIsOpen(false)}
						className="flex items-center gap-3 p-3 rounded-none hover:bg-accent hover:text-accent-foreground transition-colors mb-2"
						activeProps={{
							className:
								"flex items-center gap-3 p-3 rounded-none bg-primary text-primary-foreground hover:bg-primary/90 transition-colors mb-2",
						}}
					>
						<ChartPieIcon size={20} />
						<span className="font-medium">Dashboard</span>
					</Link>
					<Link
						to="/finance/chat"
						onClick={() => setIsOpen(false)}
						className="flex items-center gap-3 p-3 rounded-none hover:bg-accent hover:text-accent-foreground transition-colors mb-2"
						activeProps={{
							className:
								"flex items-center gap-3 p-3 rounded-none bg-primary text-primary-foreground hover:bg-primary/90 transition-colors mb-2",
						}}
					>
						<ChatCircleIcon size={20} />
						<span className="font-medium">Finance Chat</span>
					</Link>
					<Link
						to="/finance/upload"
						onClick={() => setIsOpen(false)}
						className="flex items-center gap-3 p-3 rounded-none hover:bg-accent hover:text-accent-foreground transition-colors mb-2"
						activeProps={{
							className:
								"flex items-center gap-3 p-3 rounded-none bg-primary text-primary-foreground hover:bg-primary/90 transition-colors mb-2",
						}}
					>
						<DatabaseIcon size={20} />
						<span className="font-medium">Upload Statement</span>
					</Link>
				</nav>
			</aside>
		</>
	);
}

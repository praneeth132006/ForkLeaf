import React from "react";

// The Footer component is rendered at the bottom of the page
// It provides a structured layout with brand info, product links, resources, and legal links.
// The visual changes use bg-[var(--color-basalt)] for dark background, text-[var(--color-mist)] for muted text,
// and hover:text-[var(--color-trail-teal)] for the accent color on links.
export function Footer() {
  return (
    // Outer container with full width, basalt background, top padding, margin-top, and a subtle top border contour
    <footer className="w-full bg-[var(--color-basalt)] text-[var(--color-mist)] py-16 mt-24 border-t border-[var(--color-contour)]">
      {/* Inner wrapper for max width and horizontal padding, containing the grid and bottom info */}
      <div className="max-w-7xl mx-auto px-8">
        
        {/* Grid layout container: 1 column on mobile, 5 columns on md+ screens */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-12 mb-16">
          
          {/* Brand section spanning 2 columns: contains logo and description */}
          <div className="md:col-span-2 flex flex-col gap-6">
            {/* Logo container aligning the mark and text */}
            <div className="flex items-center gap-2">
              {/* Logo mark: a teal square with 'M' character */}
              <div className="w-8 h-8 bg-[var(--color-trail-teal)] rounded flex items-center justify-center text-[var(--color-paper)] font-serif font-bold text-lg leading-none">
                M
              </div>
              {/* Logo text with serif font and chalk text color */}
              <span className="font-serif text-2xl font-semibold tracking-tight text-[var(--color-chalk)]">
                mdnotion
              </span>
            </div>
            {/* Short brand description text */}
            <p className="text-sm leading-relaxed max-w-sm">
              The seamless blend of WYSIWYG editing and raw markdown power. 
              Write once, see it live, commit straight to GitHub.
            </p>
          </div>

          {/* Links column 1: Product */}
          <div className="flex flex-col gap-4">
            {/* Heading for Product links using chalk color */}
            <h3 className="font-semibold text-[var(--color-chalk)] mb-2">Product</h3>
            {/* Features link pointing to features section with teal hover effect */}
            <a href="#features" className="text-sm hover:text-[var(--color-trail-teal)] transition-colors">Features</a>
            {/* Pricing link with teal hover effect */}
            <a href="#pricing" className="text-sm hover:text-[var(--color-trail-teal)] transition-colors">Pricing</a>
            {/* Changelog link with teal hover effect */}
            <a href="#changelog" className="text-sm hover:text-[var(--color-trail-teal)] transition-colors">Changelog</a>
          </div>

          {/* Links column 2: Resources */}
          <div className="flex flex-col gap-4">
            {/* Heading for Resources links using chalk color */}
            <h3 className="font-semibold text-[var(--color-chalk)] mb-2">Resources</h3>
            {/* Documentation link with teal hover effect */}
            <a href="#docs" className="text-sm hover:text-[var(--color-trail-teal)] transition-colors">Documentation</a>
            {/* External link to GitHub Repo opening in a new tab with teal hover effect */}
            <a href="https://github.com/praneeth132006/MarkDown" target="_blank" rel="noopener noreferrer" className="text-sm hover:text-[var(--color-trail-teal)] transition-colors">GitHub Repo</a>
            {/* Community link with teal hover effect */}
            <a href="#community" className="text-sm hover:text-[var(--color-trail-teal)] transition-colors">Community</a>
          </div>

          {/* Links column 3: Legal */}
          <div className="flex flex-col gap-4">
            {/* Heading for Legal links using chalk color */}
            <h3 className="font-semibold text-[var(--color-chalk)] mb-2">Legal</h3>
            {/* Privacy Policy link with teal hover effect */}
            <a href="#privacy" className="text-sm hover:text-[var(--color-trail-teal)] transition-colors">Privacy Policy</a>
            {/* Terms of Service link with teal hover effect */}
            <a href="#terms" className="text-sm hover:text-[var(--color-trail-teal)] transition-colors">Terms of Service</a>
          </div>

        </div>

        {/* Footer bottom bar for copyright and social links */}
        <div className="pt-8 border-t border-[var(--color-contour)] flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
          {/* Copyright text including current year */}
          <p>© {new Date().getFullYear()} mdnotion. Built as an open-source project.</p>
          {/* Social links container */}
          <div className="flex gap-4">
            {/* Twitter link */}
            <a href="#" className="hover:text-[var(--color-chalk)] transition-colors">Twitter</a>
            {/* Discord link */}
            <a href="#" className="hover:text-[var(--color-chalk)] transition-colors">Discord</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

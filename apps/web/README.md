# Frontend Architecture Documentation

Welcome to the frontend documentation for our application. This document details our architecture, the Waypoint design system, key components, routing structure, and instructions for running the application locally.

## 🏗 Frontend Architecture

Our frontend is built using **Next.js** leveraging the **App Router** for a modern, server-first React architecture. This allows us to benefit from Server Components, resulting in faster initial page loads and better SEO. 

The architecture is divided into the following key areas:
- `src/app/`: Defines our application routing, layouts, and page entry points.
- `src/components/`: Houses reusable UI elements and composite features.
- **Styling**: Utilizes global CSS and Tailwind CSS (or similar utility-first frameworks) to maintain consistent styling across the application.

## 🎨 Waypoint Design System

The application relies on the **Waypoint Design System**, a comprehensive set of UI principles and components built to ensure consistency, accessibility, and a premium user experience.

Key principles of the Waypoint Design System:
- **Function-Driven Design**: Emphasizes utility and frictionless interaction.
- **Visual Excellence**: Curated typography (e.g., Geist font), balanced whitespace, and harmonious color palettes.
- **Dynamic & Responsive**: Interfaces feel alive with micro-animations and adapt fluidly to all screen sizes.
- **Minimalism**: Focuses on stripping away the non-essential to highlight core content.

## 🧩 Core Components

Our architecture relies heavily on composable and reusable UI components. Some of the primary components driving our user experience include:

### `HeroSplitDemo`
The **Hero** section is typically the first point of interaction for the user. `HeroSplitDemo` uses a split-layout design, showcasing impactful messaging on one side and dynamic visual elements (or a product demo) on the other. It is designed to be highly engaging and responsive.

### `FeatureSections`
The `FeatureSections` component acts as the primary layout for displaying the core capabilities of the product. It maps through feature data to render beautifully aligned cards or alternating sections, ensuring clear information hierarchy and scannability.

### `Footer`
The `Footer` component provides the structural end to our pages. It includes essential navigation links, branding, social icons, and legal information. It adheres to the Waypoint design system's spacing and typography guidelines to maintain a clean appearance.

## 🛣 Routing Structure

Our routing is handled by the Next.js App Router, mapped directly to the folder structure within `src/app/`.

### `/` (Root)
The landing page of the application (`src/app/page.tsx`). It brings together our core marketing components like the `HeroSplitDemo`, `FeatureSections`, and `Footer` to introduce users to the product.

### `/editor`
The core application workspace (`src/app/editor/page.tsx`). This route provides the user interface for editing and creating content. It is designed to be a focused, distraction-free environment utilizing complex state management and specialized editor components.

## 🚀 Getting Started

Follow these instructions to run the frontend application locally.

### Prerequisites
- Node.js 18.17 or later
- npm, pnpm, yarn, or bun installed

### Installation

1. Navigate to the frontend workspace:
   ```bash
   cd apps/web
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

### Running the Development Server

Start the local development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the application running. The page will automatically hot-reload as you make changes to the code.

---

*This documentation is maintained by the Frontend Engineering Team. Please ensure all new components adhere to the Waypoint Design System guidelines.*

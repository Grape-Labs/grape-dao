import Image from "next/image";
import Link from "next/link";
import FingerprintIcon from "@mui/icons-material/Fingerprint";
import TokenIcon from "@mui/icons-material/Token";
import CollectionsOutlinedIcon from "@mui/icons-material/CollectionsOutlined";
import { ProgramAddress } from "@/components/brand/program-address";
import { LiveSignalsPanel } from "@/components/solana/live-signals-panel";
import { grapeBots, grapeLinks, grapeProducts } from "@/lib/grape";
import grapeAvatar from "@/public/images/grape-avatar.png";
import walletUnlockPreview from "@/public/images/grape_wallet_preview.png";
import walletPreview from "@/public/images/grape_wallet_preview2.png";

const tools = [
  { href: "/identity", name: "Identity", icon: FingerprintIcon, detail: "Your wallet, holdings, and on-chain identity." },
  { href: "/token", name: "Token tools", icon: TokenIcon, detail: "Create, distribute, and manage your tokens." },
  { href: "/nft", name: "NFT tools", icon: CollectionsOutlinedIcon, detail: "Manage collections and digital assets." }
];

export default function Home() {
  return (
    <main className="hub">
      <header className="hub-nav hub-width">
        <Link href="/" className="hub-brand" aria-label="Grape home">
          <Image src={grapeAvatar} alt="" width={36} height={36} priority />
          <span className="hub-wordmark">Grape Hub</span><span className="hub-brand-label">grapedao.org</span>
        </Link>
        <nav aria-label="Main navigation">
          <a href="#ecosystem">Ecosystem</a>
          <a href="#workspace">Workspace</a>
          <a href={grapeLinks.docs} target="_blank" rel="noreferrer">Docs</a>
        </nav>
        <a className="hub-nav-cta" href={grapeLinks.discord} target="_blank" rel="noreferrer">Join Grape DAO</a>
      </header>

      <section className="hub-hero" aria-labelledby="hero-heading">
        <video className="hub-video" autoPlay loop muted playsInline preload="metadata" aria-hidden="true">
          <source src="/images/grape_video.mp4" type="video/mp4" />
        </video>
        <div className="hub-hero-shade" />
        <div className="hub-width hub-hero-content">
          <p className="hub-eyebrow"><span className="hub-status" /> On-chain infrastructure for internet communities</p>
          <h1 id="hero-heading">Identity, Reputation, Access, and <span>Governance Infrastructure</span></h1>
          <p className="hub-hero-description">Grape is an ecosystem layer for identity, reputation, access, rewards, and governance, helping communities coordinate on-chain.</p>
          <div className="hub-actions">
            <a className="hub-button" href="#ecosystem">Explore the ecosystem </a>
            <a className="hub-text-link" href={grapeLinks.docs} target="_blank" rel="noreferrer">Start building </a>
          </div>
        </div>
        <div className="hub-hero-foot hub-width"><span><span className="hub-network"><span className="hub-status" /> Solana Mainnet</span></span><a href="#ecosystem">Identity / Reputation / Access / Governance</a></div>
      </section>

      <section id="workspace" className="hub-workspace hub-width" aria-label="Grape workspace">
        <div className="hub-workspace-label"><span className="hub-eyebrow">Your workspace</span><p>Wallet operations</p></div>
        {tools.map((tool) => <Link className="hub-tool" href={tool.href} key={tool.href}><tool.icon className="hub-tool-icon" aria-hidden="true" /><div><h2>{tool.name}</h2><p>{tool.detail}</p></div></Link>)}
      </section>

      <section id="ecosystem" className="hub-section hub-width">
        <div className="hub-section-heading"><div><p className="hub-eyebrow">Products</p><h2>Identity, reputation, access, and governance in one stack</h2></div><p>Grape is infrastructure for internet communities: verify members, enforce access, map reputation, and execute DAO decisions in one integrated stack.</p></div>
        <div className="hub-products">
          {grapeProducts.filter((product) => !product.isAuxiliary).map((product) => <article className="hub-product" key={product.name}>
            <div className="hub-product-top"><Image src={product.logo} alt="" width={44} height={44} /><span className="hub-product-type">{product.programId ? "Solana program" : "Governance interface"}</span></div>
            <h3><a href={product.href} target="_blank" rel="noreferrer">{product.name} </a></h3>
            <p>{product.description}</p>
            <details className="hub-details"><summary>Program & integration</summary><div>
              {product.programId && <ProgramAddress address={product.programId} />}
              {product.sdkHref && <a href={product.sdkHref} target="_blank" rel="noreferrer">SDK on npm</a>}
              {product.requestBotFromDao && <a href={grapeLinks.discord} target="_blank" rel="noreferrer">Request Discord bot</a>}
              <a href={product.href} target="_blank" rel="noreferrer">{product.ctaLabel}</a>
            </div></details>
          </article>)}
          <article className="hub-product hub-build-card"><span className="hub-eyebrow">How It Connects</span><h3>Composable primitives for communities that need to scale</h3><p>These programs are core primitives, not isolated features. They create a common trust layer that other products, communities, and DAOs can compose without rebuilding identity, reputation, or access logic from scratch.</p><a className="hub-text-link" href={grapeLinks.docs} target="_blank" rel="noreferrer">Explore the docs</a></article>
        </div>
        <details className="hub-auxiliary hub-details"><summary>More building blocks · Distribution & bundled transfers</summary><div>{grapeProducts.filter((product) => product.isAuxiliary).map((product) => <div key={product.name}><h3><a href={product.href} target="_blank" rel="noreferrer">{product.name}</a></h3><p>{product.description}</p>{product.sdkHref && <a href={product.sdkHref} target="_blank" rel="noreferrer">SDK on npm</a>}</div>)}</div></details>
        <details className="hub-details hub-network-details"><summary>Live Solana network signals</summary><div><LiveSignalsPanel /></div></details>
      </section>

      <section className="hub-wallet hub-width">
        <div className="hub-wallet-copy"><p className="hub-eyebrow">Beta Preview <span className="hub-beta">In beta</span></p><h2>Grape Wallet for Chromium and Android</h2><p>Grape Wallet is now in beta as a new extension and mobile experience with a broader multi-chain product direction.</p><a className="hub-button hub-button-light" href={grapeLinks.discord} target="_blank" rel="noreferrer">Get beta updates </a><span className="hub-platforms">Chromium extension / Android app</span></div>
        <div className="hub-wallet-art">
          <div className="hub-wallet-screen hub-wallet-screen-secondary"><Image src={walletUnlockPreview} alt="Grape Wallet beta unlock screen on Android" sizes="(max-width: 420px) 146px, (max-width: 1000px) 178px, 205px" /></div>
          <div className="hub-wallet-screen"><Image src={walletPreview} alt="Grape Wallet beta home screen on Android" sizes="(max-width: 420px) 165px, (max-width: 1000px) 200px, 230px" /></div>
        </div>
      </section>

      <section className="hub-section hub-width">
        <div className="hub-section-heading"><div><p className="hub-eyebrow">Getting Started</p><h2>Launch Your Reputation Layer</h2></div><a className="hub-text-link" href="https://reputation.governance.so" target="_blank" rel="noreferrer">Create your space</a></div>
        <div className="hub-steps">{[
          ["01", "Create Your OG Reputation Space", "Create your Space, set branding, and publish your on-chain reputation hub for your community."],
          ["02", "Establish Your Reputation Layer", "Reputation is your community’s trust infrastructure. Define how influence is earned, verified, and preserved — across manual awards, Discord automation, on-chain actions, and seasonal rules."],
          ["03", "Set Up Your Discord Bot", "Deploy your Discord bot to automate awards, recognize participation, and connect your community activity directly to on-chain reputation."]
        ].map(([number, title, description]) => <article key={number}><span className="hub-index">{number}</span><h3>{title}</h3><p>{description}</p></article>)}</div>
        <details className="hub-details hub-bots"><summary>Explore the Discord bots <span>{grapeBots.length} integrations</span></summary><div>{grapeBots.map((bot) => <article key={bot.name}><h3>{bot.name}</h3><p>{bot.description}</p></article>)}<a className="hub-text-link" href={grapeLinks.discord} target="_blank" rel="noreferrer">Request bot access</a></div></details>
      </section>

      <section className="hub-community hub-width"><p className="hub-eyebrow">Grape DAO</p><h2>Decentralized Social Networking Infrastructure</h2><p>Create, reward, and secure online communities by harnessing the speed and composability of Solana.</p><a className="hub-button" href={grapeLinks.discord} target="_blank" rel="noreferrer">Join Grape DAO </a></section>
      <footer className="hub-footer hub-width"><Link href="/" className="hub-brand"><Image src={grapeAvatar} alt="" width={36} height={36} /><span className="hub-wordmark">Grape Hub</span><span className="hub-brand-label">grapedao.org</span></Link><nav aria-label="Footer navigation"><a href={grapeLinks.x} target="_blank" rel="noreferrer">X</a><a href={grapeLinks.github} target="_blank" rel="noreferrer">GitHub</a><Link href="/faq">FAQ</Link><Link href="/claims">Claims</Link></nav><span>Built on Solana</span></footer>
    </main>
  );
}

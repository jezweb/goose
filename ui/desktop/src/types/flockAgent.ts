/**
 * A geese-flock agent — a markdown file under `~/.agents/agents/` (Goose's
 * native agent directory convention) with YAML frontmatter that declares the
 * agent's identity.
 *
 * The slug is the filename without extension (e.g. `orchestrator.md` → slug
 * `orchestrator`). The other fields come from the YAML frontmatter; only
 * `name` is required by Goose's parser.
 */

export interface FlockAgent {
  /** Filename stem — what we use to tag sessions. */
  slug: string;
  /** Display name from frontmatter. */
  name: string;
  /** Optional one-line description from frontmatter. */
  description?: string;
  /** Optional model preference from frontmatter. */
  model?: string;
  /** Absolute path to the agent's .md file, useful for the substrate plugin. */
  path: string;
}

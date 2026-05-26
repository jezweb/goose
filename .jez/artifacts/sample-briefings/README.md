# Sample briefings — Office Town buildings

Draft `.goosehints` files for each Office Town building. When Goose opens a session in one of these directories, the briefing auto-loads and orients the agent: where they are, who they are, what's at hand, what the standing orders are.

These are **drafts for review**, not yet placed in the live substrate.

## Mapping — sample file → live location

| Sample file | Building | Goes to |
|---|---|---|
| `office.goosehints.md` | The Office (or Town Hall) | `/Users/Shared/goanna/agents/boss/.goosehints` |
| `library.goosehints.md` | The Library | `/Users/Shared/goanna/agents/librarian/.goosehints` |
| `workshop.goosehints.md` | The Workshop | `/Users/Shared/goanna/agents/worker/.goosehints` |
| `lookout.goosehints.md` | The Lookout | `/Users/Shared/goanna/agents/scout/.goosehints` |
| `post-office.goosehints.md` | The Post Office | `/Users/Shared/goanna/agents/anthro/.goosehints` |

To place one in the substrate (when ready):

```bash
cp ~/Documents/goose/.jez/artifacts/sample-briefings/library.goosehints.md \
   /Users/Shared/goanna/agents/librarian/.goosehints
```

Goannad will pick it up and bi-sync to R2. Future Goose sessions opened in that directory will auto-load it.

## Design principles

1. **Complement, don't duplicate.** The existing `CLAUDE.md` files hold the rich persona (identity, voice, vibe). The `.goosehints` is a short Office Town overlay — it points at `CLAUDE.md` for the full thing.
2. **Office Town vocabulary.** Each briefing uses the Town · Place · Role · Task · Delegate-to vocabulary, with brackets to the Goose primitive on first mention.
3. **Spatial framing.** Each briefing orients the agent in the town — what building they're in, who's next door, when to delegate elsewhere.
4. **Auto-loaded, not addressed to the user.** The briefing speaks TO the agent loading it ("you are at the Library"), not about them.

## Related

- Office Town vocabulary canonical reference: `~/Documents/.jez/knowledge/office-town.md`
- Goose fork design doc: `~/Documents/goose/.jez/artifacts/geese-flock-design.md`
- Existing goanna persona files: `/Users/Shared/goanna/agents/<role>/CLAUDE.md`

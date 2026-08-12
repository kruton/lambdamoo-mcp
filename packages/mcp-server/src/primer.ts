export const SYNTAX_PRIMER_URI = "moo://syntax-primer";

export const LAMBDAMOO_SYNTAX_PRIMER = `# LambdaMOO syntax primer

LambdaMOO is not JavaScript. Write verb bodies as statements; do not add functions, classes, imports, braces, \`//\` comments, or zero-based indexing.

- End simple statements with \`;\`. Blocks use keywords: \`if (condition) ... elseif (condition) ... else ... endif\`, \`while (condition) ... endwhile\`, \`for item in (list) ... endfor\`, \`for i in [1..count] ... endfor\`, \`fork (seconds) ... endfork\`, and \`try ... except error (E_PERM) ... finally ... endtry\`.
- Strings and lists are indexed from 1. Ranges are inclusive. \`$\` means the final index: \`items[1]\`, \`items[2..$]\`.
- Lists use braces: \`{1, 2, 3}\`. Splice list elements into a call or list with \`@items\`. Scattering assignment can destructure arguments: \`{target, ?options = {}, @rest} = args;\`.
- Invoke verbs with \`object:verb(arguments)\`. Dynamic names require parentheses: \`object:(verb_name)(arguments)\`. Access properties with \`object.property\` or \`object.(property_name)\`. Built-ins such as \`length()\` are functions, not verbs.
- Common task variables are \`this\`, \`caller\`, \`player\`, \`verb\`, \`args\`, \`argstr\`, \`dobj\`, \`dobjstr\`, \`prepstr\`, \`iobj\`, and \`iobjstr\`. Positional arguments live in the 1-based \`args\` list.
- Catch errors with \`try\` blocks or a catch expression such as \`\` \`expression ! E_PERM, E_INVARG => fallback' \`\`. \`ANY\` matches every error. Use \`raise(error, message)\` when propagating failures.
- The conditional expression is \`condition ? true_value | false_value\`; use \`&&\`, \`||\`, \`!\`, \`==\`, and \`!=\`, not JavaScript ternaries or strict equality. Equality across different types is allowed: \`==\` returns false and \`!=\` returns true; it is not a type error.
- A bare string used as a statement is a comment or docstring.
- Prefer stable registry symbols such as \`$thing\`, \`$player\`, and \`$string_utils\` over database-local object numbers such as \`#5\`. Negative objects are stable sentinels: \`#-1\` is \`$nothing\`, \`#-2\` is \`$ambiguous_match\`, and \`#-3\` is \`$failed_match\`.
`;

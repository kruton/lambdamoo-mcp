declare module "tree-sitter-lambdamoo" {
  import type Parser from "tree-sitter";
  const language: Parser.Language;
  export = language;
}

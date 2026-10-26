generator go {
  output_type go
  output_dir "../"
  version "0.226.2"
  on_generate "goimports -w ."
}

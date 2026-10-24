contained() (
  case "$1" in "$INSTALL_HOME"/*) ;; *) die "Path containment refused: $1" ;; esac
  case "$1" in */../*|*/./*|*/..|*/.) die "Unnormalized path refused: $1" ;; esac
  CURSOR=$1
  while [ "$CURSOR" != "$INSTALL_HOME" ]; do
    [ ! -L "$CURSOR" ] || die "Ancestor symlink refused: $CURSOR"
    if [ -d "$CURSOR" ]; then
      RESOLVED=$(CDPATH= cd -P -- "$CURSOR" && pwd -P) || die 'Cannot resolve path'
      case "$RESOLVED" in "$INSTALL_HOME"/*) ;; *) die "Path containment refused: $CURSOR" ;; esac
    fi
    CURSOR=${CURSOR%/*}
  done
)

# Zstandard vendoring

This directory vendors the Zstandard C library amalgamation from the official
Facebook/Meta `zstd` release **v1.5.7**. The upstream release archive is
`https://github.com/facebook/zstd/releases/download/v1.5.7/zstd-1.5.7.tar.gz`,
SHA-256 `eb33e51f49a15e023950cd7825ca74a4a2b43db8354825ac24fc1b7ee09e6fa3`.

`zstd.c` was generated from the unmodified release source by running
`build/single_file_libs/create_single_file_library.sh` from
`build/single_file_libs/`. The unmodified public headers copied from the same
hash-verified archive are `lib/zstd.h`, `lib/zdict.h`, and `lib/zstd_errors.h`.
`zstd.h` includes `zstd_errors.h`; these three files contain the complete
transitive public-header dependency set (apart from standard C headers).
`LICENSE` is the release-root BSD license. To reproduce, verify the archive
hash, extract it, run that generator, and copy those three headers and `LICENSE`.

The amalgamation is compiled as a C translation unit/object in iOS, Android,
and host builds. Keep it separate from Objective-C++ and project-wide
`-Werror` settings.

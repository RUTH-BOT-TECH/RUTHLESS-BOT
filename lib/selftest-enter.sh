#!/bin/sh
# Enter disposable user, mount, network and PID namespaces. The caller must use
# unshare --user --map-root-user --mount --net --pid --fork. Fail closed.
set -eu
root=$1; source=$2; modules=$3; node=$4; command=$5
mount --make-rprivate /
mount --bind /usr "$root/usr"
mount -o remount,bind,ro "$root/usr"
mount --bind "$source" "$root/app"
mount -o remount,bind,ro "$root/app"
mount --bind "$modules" "$root/app/node_modules"
mount -o remount,bind,ro "$root/app/node_modules"
for device in null zero random urandom; do
 mount --bind "/dev/$device" "$root/dev/$device"
done
# No /proc, host /home, bot data, session directory, .env, or live socket exists here.
# Drop namespace capabilities after chroot so code cannot undo mounts or escape.
exec /usr/sbin/chroot "$root" /usr/bin/setpriv --no-new-privs --bounding-set=-all --inh-caps=-all --ambient-caps=-all "$node" /app/lib/selftest-worker.js "$command"

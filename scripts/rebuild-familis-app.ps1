# Rebuilds only the familis-app image (kiosk-image) and redeploys it to the Docker Desktop cluster.
# Run from the repo root:  .\scripts\rebuild-familis-app.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

$version = "local-" + (Get-Date -Format "yyyyMMddHHmmss")
docker build -t "familis-app:$version" .\kiosk-image

$node = kubectl get nodes -o jsonpath='{.items[0].metadata.name}'
$archiveName = "familis-app-$version.tar"
$imageArchive = ".\$archiveName"
$nodeImageArchive = "/root/$archiveName"

docker save -o $imageArchive "familis-app:$version"
docker cp $imageArchive "${node}:$nodeImageArchive"
docker exec $node ctr -n k8s.io images import --all-platforms $nodeImageArchive
docker exec $node ctr -n k8s.io images tag --force "docker.io/library/familis-app:$version" docker.io/library/familis-app:k8s
docker exec $node rm -f $nodeImageArchive
Remove-Item $imageArchive

kubectl -n familis rollout restart deployment/familis
kubectl -n familis rollout status deployment/familis --timeout=300s
Write-Host "Done. Reload https://localhost and sign in as admin."

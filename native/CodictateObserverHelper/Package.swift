// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "CodictateObserverHelper",
  platforms: [.macOS(.v13)],
  products: [
    .executable(
      name: "CodictateObserverHelper",
      targets: ["CodictateObserverHelper"]
    ),
  ],
  targets: [
    .executableTarget(
      name: "CodictateObserverHelper",
      linkerSettings: [
        .linkedFramework("ApplicationServices"),
        .linkedFramework("AppKit"),
      ]
    ),
  ]
)

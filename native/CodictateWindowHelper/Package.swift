// swift-tools-version: 6.2

import PackageDescription

let package = Package(
  name: "CodictateWindowHelper",
  platforms: [.macOS(.v13)],
  products: [
    .executable(name: "CodictateWindowHelper", targets: ["CodictateWindowHelper"]),
  ],
  targets: [
    .executableTarget(
      name: "CodictateWindowHelper"
    ),
  ]
)

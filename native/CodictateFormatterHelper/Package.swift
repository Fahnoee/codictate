// swift-tools-version: 6.2

import PackageDescription

let package = Package(
  name: "CodictateFormatterHelper",
  platforms: [.macOS(.v26)],
  products: [
    .executable(name: "CodictateFormatterHelper", targets: ["CodictateFormatterHelper"]),
  ],
  targets: [
    .executableTarget(
      name: "CodictateFormatterHelper",
      linkerSettings: [
        .linkedFramework("FoundationModels"),
      ]
    ),
  ]
)

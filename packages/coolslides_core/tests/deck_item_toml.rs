use coolslides_core::DeckItem;

#[derive(serde::Deserialize, Debug)]
struct Wrap {
    item: DeckItem,
}

#[test]
fn ref_from_plain_string() {
    let toml_str = r#"item = "intro""#;
    let wrap: Wrap = toml::from_str(toml_str).expect("parse plain string ref");
    match wrap.item {
        DeckItem::Ref { slide_id } => assert_eq!(slide_id, "intro"),
        _ => panic!("expected ref variant"),
    }
}

#[test]
fn ref_from_shorthand_table() {
    let toml_str = r#"item = { ref = "intro" }"#;
    let wrap: Wrap = toml::from_str(toml_str).expect("parse shorthand ref table");
    match wrap.item {
        DeckItem::Ref { slide_id } => assert_eq!(slide_id, "intro"),
        _ => panic!("expected ref variant"),
    }
}

#[test]
fn ref_from_canonical() {
    let toml_str = r#"item = { type = "ref", ref = "intro" }"#;
    let wrap: Wrap = toml::from_str(toml_str).expect("parse canonical ref");
    match wrap.item {
        DeckItem::Ref { slide_id } => assert_eq!(slide_id, "intro"),
        _ => panic!("expected ref variant"),
    }
}

#[test]
fn group_from_shorthand_table() {
    let toml_str = r#"item = { name = "Section", slides = ["a", "b"] }"#;
    let wrap: Wrap = toml::from_str(toml_str).expect("parse shorthand group table");
    match wrap.item {
        DeckItem::Group { name, transition, slides } => {
            assert_eq!(name, "Section");
            assert!(transition.is_none());
            assert_eq!(slides, vec!["a", "b"]);
        }
        _ => panic!("expected group variant"),
    }
}

#[test]
fn group_from_canonical() {
    let toml_str = r#"item = { type = "group", name = "Section", slides = ["a", "b"], transition = "slide" }"#;
    let wrap: Wrap = toml::from_str(toml_str).expect("parse canonical group");
    match wrap.item {
        DeckItem::Group { name, transition, slides } => {
            assert_eq!(name, "Section");
            assert_eq!(transition.as_deref(), Some("slide"));
            assert_eq!(slides, vec!["a", "b"]);
        }
        _ => panic!("expected group variant"),
    }
}

#[test]
fn group_missing_name_errors() {
    let toml_str = r#"item = { slides = ["a"] }"#;
    let err = toml::from_str::<Wrap>(toml_str).unwrap_err();
    let msg = err.to_string();
    assert!(msg.contains("group item missing required field 'name'"), "unexpected error: {}", msg);
}

# Source code style

## Automatic formatting

Use Uncrustify 0.83.0_f with the root `uncrustify.cfg`.
It uses tabs with width 4, preserves existing single-line `if` statements,
does not join multiline `if` statements and adds a blank line between checks.
Leave one blank line between method and function definitions
(`nl_after_func_body = 2`: two newline characters).
Definitions inside classes and single-line bodies also use
`nl_after_func_body_class = 2` and `nl_after_func_body_one_liner = 2`.
The profile comes unchanged from the owner's NaWServer project. A nested
single-line destructor can require a second pass in Uncrustify 0.83.0_f;
run Apply twice when importing existing source and verify Check afterwards.

From the repository root in PowerShell:

```powershell
.\uncrustify-check.cmd
.\uncrustify-apply.cmd --check
.\uncrustify-apply.cmd
.\uncrustify-apply.cmd --help
powershell -NoProfile -File tools/format_cpp.ps1 -Mode List
```

The CMD files are thin wrappers around the same PowerShell helper; they also
work when invoked by full path from another directory or a path containing spaces.
Unknown/extra arguments exit with code 2 before any file is processed.
Check reports differences; Apply changes files; List prints the exact scope.
Git and Uncrustify are found through PATH. `UNCRUSTIFY` or `-FormatterPath`
can select an executable without storing machine paths in the repository.
Only tracked, existing C/C++ files are processed. Root and nested vendor,
third_party, managed_components, node_modules, .pio, fonts, generated and SIG
directories are excluded. So are generated contracts/catalogs, assets.hpp,
sample_image.hpp and the third-party LilyGO board.cpp adaptation. New files
must be staged before they enter the scope. Other languages are not formatted.
No command creates a commit; Apply creates no backup or MD5 files.
Exit codes: 0 = success, 1 = processing errors or Check differences,
2 = setup/version/configuration or wrapper argument errors.
File checks continue after differences and report the total failure count.

Install the exact Uncrustify 0.83.0_f version and use PATH or the executable option.
Do not run apply unless the owner requests source formatting.

The former .clang-format is archived in ignored `local/clang-format-archive/`.
It is inactive. Do not run clang-format alongside the canonical profile.

Read this file before writing or formatting source code. Examples and notes
define the formatting style for the indicated language and scope. The initial
examples are an editable starting point for the owner; follow owner edits here.
Formatting alone must not change logic or identifiers.
Do not reformat the whole repository unless explicitly requested.

## Example 1: declarations, classes and headers

Scope: C++ declarations in project headers.

```cpp
#pragma once

#include <cstddef>
#include <cstdint>

namespace lvgl_cbor
{

	// The buffer is borrowed and must outlive this object.
	class MessageBuffer
	{
	public:
		MessageBuffer(std::uint8_t *storage, std::size_t capacity);

		bool append(const std::uint8_t *data, std::size_t size);
		std::size_t size() const;

	private:
		std::uint8_t *storage_;
		std::size_t capacity_;
		std::size_t size_ = 0;
	};

} // namespace lvgl_cbor
```

Notes (edit these together with the example):

- Use tabs for indentation, displayed as 4 spaces. Spaces may be used for alignment within a line.
- Put opening braces on a new line. Align public/private with the class braces.
- Put pointer and reference symbols next to the name: `const Request &request`, `std::uint8_t *data`.
- Do not add extra spaces to align declarations in columns.

## Example 2: functions, conditions and line breaks

Scope: C++ function definitions and control flow.

```cpp
MessageBuffer::MessageBuffer(std::uint8_t *storage, std::size_t capacity)
  : storage_(storage), capacity_(capacity)
{
}

bool MessageBuffer::append(const std::uint8_t *data, std::size_t size)
{
	if(data == nullptr)
		return false;

	if(data == nullptr || storage_ == nullptr || size > capacity_ - size_)
	{
		return false;
	}

	for(std::size_t index = 0; index < size; ++index)
	{
		storage_[size_ + index] = data[index];
	}

	size_ += size;
	return true;
}

std::size_t MessageBuffer::size() const
{
	return size_;
}

// For a long call, put each argument on its own line.
const bool published = publish_device_status(
	device_identifier,
	current_connection_count,
	available_memory_bytes,
	last_rejection_reason);
```

Notes:

- Do not add a space after if/for/while or inside parentheses.
- Put spaces around operators.
- Put a space after each semicolon inside parentheses.
- Use braces for if/else/for/while blocks, even with one statement. You may omit braces for a simple condition with a simple action, as shown above.
- Put one statement on each line, except existing single-line `if` statements with
  a simple action: preserve them. Do not join multiline `if` statements.
  Use multiple lines even for short functions.
- Keep lines within 120 characters. Split long calls as shown above.
- Separate logical steps with one blank line. Put comments before the related code.

These examples define formatting only. They do not introduce APIs or naming rules.
Keep existing names and required SDK identifiers.
For other languages, follow their local rules. Do not apply this C++ style automatically.

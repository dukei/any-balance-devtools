<?xml version="1.0" encoding="utf-8"?>
<!-- Created with Liquid Studio 2021 (https://www.liquid-technologies.com) -->
<schema xmlns="http://purl.oclc.org/dsdl/schematron">
    <title>A Schematron Mini-Schema for AnyBalance Manifest</title>
    <ns prefix="sch" uri="http://purl.oclc.org/dsdl/schematron" />
    <pattern>
        <rule context="counter[@type=('array','array_entity','folder')]">
            <assert test="./counter">
                Compound counter id:<value-of select="@id" />
                should contain subcounters
            </assert>
            <assert test="not(@units) and not(@format) and not(@prefix) and not(@suffix) and not(@flags)">
                Compound counter id:<value-of select="@id" /> can specify 
                only 'id', 'name' and 'type' attributes
            </assert>
        </rule>
        <rule context="counter[@type=('numeric','time','time_interval','text','html','bool') or not(@type)]">
            <assert test="not(counter)">
                Simple counter id:<value-of select="@id" /> should not contain subcounters
            </assert>
        </rule>
        <rule context="/provider/author">
            <assert test="matches(text(),'\w+[\w\s]*&lt;([0-9a-zA-Z_]([-.\w]*[0-9a-zA-Z_])*@([0-9a-zA-Z][-\w]*[0-9a-zA-Z]\.)+[a-zA-Z]{2,9})&gt;')">
                Wrong format for author <value-of select="."/> 
                Example of the correct author format: Alex Spacer &lt;alex@email.org&gt;
            </assert>
        </rule>
    </pattern>
</schema>
